import { useState, useEffect, useMemo, forwardRef } from 'react';
import { parseM3U } from './utils/m3u';
import type { Channel, Series } from './types';
import { Player } from './components/Player';
import { Play, Search, Menu, Tv, Film, MonitorPlay, ArrowLeft, Layers } from 'lucide-react';
import { VirtuosoGrid } from 'react-virtuoso';

const GridList = forwardRef<HTMLDivElement, any>(({ style, children, ...props }, ref) => (
  <div
    ref={ref}
    style={{
      ...style,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: '1rem',
      paddingLeft: '1.5rem',
      paddingRight: '1.5rem',
      paddingBottom: '1.5rem',
      alignContent: 'start'
    }}
    {...props}
  >
    {children}
  </div>
));

function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Load Categories and Channels
  useEffect(() => {
    // Try API first (production), fallback to local file (development)
    const playlistUrl = import.meta.env.DEV ? '/canais.m3u' : '/api/playlist';
    
    fetch(playlistUrl)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load playlist');
        return res.text();
      })
      .then(text => {
        const parsed = parseM3U(text);
        setChannels(parsed);
        const groups = Array.from(new Set(parsed.map(c => c.group))).sort();
        if (groups.length > 0) setSelectedCategory(groups[0]);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load playlist. Check server configuration.');
        setLoading(false);
      });
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    channels.forEach(c => {
      map.set(c.group, (map.get(c.group) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [channels]);

  // Filter channels based on category and search
  const filteredChannels = useMemo(() => {
    if (!selectedCategory && !searchQuery) return [];

    let result = channels;
    if (selectedCategory) {
      result = result.filter(c => c.group === selectedCategory);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q));
    }
    return result;
  }, [channels, selectedCategory, searchQuery]);

  // Group into Series if applicable
  const { isSeriesView, groupedSeries } = useMemo(() => {
    // Check if we have enough series metadata to warrant a series view
    const seriesItems = filteredChannels.filter(c => c.seriesName);
    const isSeries = seriesItems.length > 0 && (seriesItems.length / filteredChannels.length) > 0.5;

    if (!isSeries) {
      return { isSeriesView: false, groupedSeries: [], standaloneChannels: filteredChannels };
    }

    const seriesMap = new Map<string, Series>();
    const standalones: Channel[] = [];

    filteredChannels.forEach(c => {
      if (c.seriesName) {
        if (!seriesMap.has(c.seriesName)) {
            seriesMap.set(c.seriesName, {
                name: c.seriesName,
                logo: c.logo, // Use first episode logo
                seasonCount: 0,
                episodeCount: 0,
                episodes: []
            });
        }
        const s = seriesMap.get(c.seriesName)!;
        s.episodes.push(c);
        s.episodeCount++;
      } else {
        standalones.push(c);
      }
    });

    // Calculate seasons and sort episodes
    seriesMap.forEach(s => {
        s.episodes.sort((a, b) => {
             const sA = a.season || 0;
             const sB = b.season || 0;
             if (sA !== sB) return sA - sB;
             return (a.episode || 0) - (b.episode || 0);
        });
        const seasons = new Set(s.episodes.map(e => e.season || 1));
        s.seasonCount = seasons.size;
    });

    return { 
        isSeriesView: true, 
        groupedSeries: Array.from(seriesMap.values()), 
        standaloneChannels: standalones 
    };
  }, [filteredChannels]);


  if (loading) return (
    <div className="loading-container"><div className="spinner"></div></div>
  );

  if (error) return (
    <div className="loading-container"><p style={{ color: '#ef4444' }}>{error}</p></div>
  );

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="brand-icon"><Tv className="text-white" size={20} color="white" /></div>
          <h1 style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.025em' }}>CineFlow</h1>
        </div>
        
        <div className="sidebar-content">
          <div className="flex flex-col gap-2">
            {categories.map(cat => (
              <button
                key={cat.name}
                onClick={() => {
                  setSelectedCategory(cat.name);
                  setSearchQuery('');
                  setSelectedSeries(null);
                  setSelectedSeason(null);
                }}
                className={`category-btn ${selectedCategory === cat.name ? 'active' : ''}`}
              >
                <span className="truncate mr-2">{cat.name}</span>
                <span className="badge">{cat.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <header className="header">
          <div className="flex items-center gap-4 flex-1">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="icon-btn">
              <Menu size={20} />
            </button>
            
            {selectedSeries ? (
               <button onClick={() => {
                  if (selectedSeason !== null) {
                     setSelectedSeason(null);
                  } else {
                     setSelectedSeries(null);
                  }
               }} className="flex items-center gap-2 hover:text-white transition-colors" style={{color: 'var(--text-secondary)'}}>
                  <ArrowLeft size={20} />
                  <span style={{fontWeight: 600}}>{selectedSeason !== null ? `Back to Seasons` : 'Back to List'}</span>
               </button>
            ) : (
                <div className="search-container">
                <Search className="search-icon" size={18} />
                <input 
                    type="text"
                    placeholder={`Search in ${selectedCategory}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                />
                </div>
            )}
          </div>
          
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent)', background: 'rgba(229, 9, 20, 0.1)', padding: '0.25rem 0.75rem', borderRadius: '999px', border: '1px solid rgba(229, 9, 20, 0.2)' }}>
            {selectedSeries && selectedSeason !== null
                ? `${selectedSeries.episodes.filter(e => (e.season || 1) === selectedSeason).length} Episodes`
                : (selectedSeries ? `${selectedSeries.seasonCount} Seasons` : (isSeriesView ? `${groupedSeries.length} Series` : `${filteredChannels.length} Channels`))}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative">
            
          {/* SERIES DETAIL VIEW - EPISODES (Season Selected) */}
          {selectedSeries && selectedSeason !== null ? (() => {
              const seasonEpisodes = selectedSeries.episodes.filter(e => (e.season || 1) === selectedSeason);
              return (
                 <VirtuosoGrid
                    style={{ height: '100%', width: '100%' }}
                    totalCount={seasonEpisodes.length}
                    components={{ List: GridList, Header: () => <div style={{padding: '1.5rem'}}><h2 style={{fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem'}}>{selectedSeries.name}</h2><p style={{color: 'var(--text-secondary)'}}>Season {selectedSeason} • {seasonEpisodes.length} Episodes</p></div> }}
                    itemContent={(index) => {
                        const ep = seasonEpisodes[index];
                        return (
                            <div onClick={() => setSelectedChannel(ep)} className="card">
                                <div className="card-image-container">
                                    {ep.logo ? (
                                        <img src={ep.logo} alt={ep.name} className="card-img" loading="lazy" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                                    ) : (
                                        <div style={{ opacity: 0.2 }}><MonitorPlay size={40} /></div>
                                    )}
                                    <div className="play-overlay"><div className="play-btn-circle"><Play color="white" fill="white" size={24} style={{ marginLeft: '4px' }} /></div></div>
                                </div>
                                <div className="card-info">
                                    <h3 className="card-title">Episode {ep.episode}</h3>
                                    <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem'}}>{ep.name}</p>
                                </div>
                            </div>
                        );
                    }}
                 />
              );
          })() : 
          
          /* SERIES DETAIL VIEW - SEASONS */
          selectedSeries ? (() => {
              const seasonsSet = new Set(selectedSeries.episodes.map(e => e.season || 1));
              const seasons = Array.from(seasonsSet).sort((a, b) => a - b);
              return (
                 <VirtuosoGrid
                    style={{ height: '100%', width: '100%' }}
                    totalCount={seasons.length}
                    components={{ List: GridList, Header: () => <div style={{padding: '1.5rem'}}><h2 style={{fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem'}}>{selectedSeries.name}</h2><p style={{color: 'var(--text-secondary)'}}>{selectedSeries.episodeCount} Episodes Total</p></div> }}
                    itemContent={(index) => {
                        const seasonNum = seasons[index];
                        const epCount = selectedSeries.episodes.filter(e => (e.season || 1) === seasonNum).length;
                        const firstEp = selectedSeries.episodes.find(e => (e.season || 1) === seasonNum);
                        return (
                            <div onClick={() => setSelectedSeason(seasonNum)} className="card">
                                <div className="card-image-container">
                                    {firstEp?.logo ? (
                                        <img src={firstEp.logo} alt={`Season ${seasonNum}`} className="card-img" loading="lazy" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                                    ) : (
                                        <div style={{ opacity: 0.2 }}><Layers size={40} /></div>
                                    )}
                                    <div className="play-overlay" style={{background: 'rgba(0,0,0,0.7)', flexDirection: 'column'}}>
                                        <span style={{fontWeight: 700, fontSize: '1.5rem'}}>Season {seasonNum}</span>
                                        <span style={{fontSize: '0.9rem', color: '#ccc'}}>{epCount} Episodes</span>
                                    </div>
                                </div>
                                <div className="card-info">
                                    <h3 className="card-title">Season {seasonNum}</h3>
                                    <p className="card-group">{epCount} Episodes</p>
                                </div>
                            </div>
                        );
                    }}
                 />
              );
          })() : 
          
          /* SERIES LIST VIEW */
          (isSeriesView && !searchQuery.includes('S')) ? (
              <VirtuosoGrid
                style={{ height: '100%', width: '100%' }}
                totalCount={groupedSeries.length}
                components={{ List: GridList, Header: () => <div style={{ height: '1.5rem' }} /> }}
                itemContent={(index) => {
                  const s = groupedSeries[index];
                  return (
                    <div onClick={() => setSelectedSeries(s)} className="card">
                      <div className="card-image-container">
                        {s.logo ? (
                          <img src={s.logo} alt={s.name} className="card-img" loading="lazy" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                        ) : (
                          <div style={{ opacity: 0.2 }}><Layers size={40} /></div>
                        )}
                        <div className="play-overlay" style={{background: 'rgba(0,0,0,0.7)', flexDirection: 'column'}}>
                            <span style={{fontWeight: 700, fontSize: '1.25rem'}}>{s.seasonCount} Seasons</span>
                            <span style={{fontSize: '0.9rem', color: '#ccc'}}>{s.episodeCount} Eps</span>
                        </div>
                      </div>
                      <div className="card-info">
                        <h3 className="card-title">{s.name}</h3>
                        <p className="card-group">Series</p>
                      </div>
                    </div>
                  );
                }}
              />
          ) : 
          
          /* STANDARD CHANNEL VIEW (Canais / Filmes) */
          (
            filteredChannels.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-secondary">
                  <div className="p-6 bg-secondary rounded-full mb-4" style={{ borderRadius: '50%', backgroundColor: 'var(--bg-secondary)', padding: '2rem' }}>
                     <Film size={48} style={{ opacity: 0.2 }} />
                  </div>
                  <p style={{ fontSize: '1.125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>No content found</p>
                </div>
              ) : (
                 <VirtuosoGrid
                  style={{ height: '100%', width: '100%' }}
                  totalCount={filteredChannels.length}
                  components={{ List: GridList, Header: () => <div style={{ height: '1.5rem' }} /> }}
                  itemContent={(index) => {
                    const channel = filteredChannels[index];
                    return (
                      <div onClick={() => setSelectedChannel(channel)} className="card">
                        <div className="card-image-container">
                          {channel.logo ? (
                            <img src={channel.logo} alt={channel.name} className="card-img" loading="lazy" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                          ) : (
                            <div style={{ opacity: 0.2 }}><MonitorPlay size={40} /></div>
                          )}
                          <div className="play-overlay"><div className="play-btn-circle"><Play color="white" fill="white" size={24} style={{ marginLeft: '4px' }} /></div></div>
                        </div>
                        <div className="card-info">
                          <h3 className="card-title">{channel.name}</h3>
                          <div className="card-meta"><span className="status-dot"></span><p className="card-group">{channel.group}</p></div>
                        </div>
                      </div>
                    );
                  }}
                />
              )
          )}
        </div>
      </div>

      {/* Player Modal */}
      {selectedChannel && (
        <Player 
          channel={selectedChannel} 
          onClose={() => setSelectedChannel(null)} 
        />
      )}
    </div>
  );
}

export default App;
