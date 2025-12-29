import type { Channel } from '../types';

// Convert broken assistirpainel.net URLs to working TMDB URLs
function fixImageUrl(url: string): string {
  if (!url) return '';
  
  // Check if it's a broken assistirpainel URL
  if (url.includes('assistirpainel.net')) {
    // Extract the image ID from URLs like:
    // http://assistirpainel.net:8080/images/vGrS1mzlSHQQdOcmqH1zlE2iViY_small.jpg
    const match = url.match(/\/images\/([a-zA-Z0-9]+)(?:_small)?\.jpg/);
    if (match) {
      // Convert to TMDB URL format
      return `https://image.tmdb.org/t/p/w500/${match[1]}.jpg`;
    }
  }
  
  return url;
}

export function parseM3U(content: string): Channel[] {
  const lines = content.split('\n');
  const channels: Channel[] = [];
  let currentGroup = 'Uncategorized';
  let currentLogo = '';
  let currentId = '';
  let currentName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      // Extract metadata
      const groupMatch = line.match(/group-title="([^"]*)"/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const idMatch = line.match(/tvg-id="([^"]*)"/);
      
      // Name is usually after the last comma
      const nameParts = line.split(',');
      const name = nameParts[nameParts.length - 1].trim();

      currentGroup = groupMatch ? groupMatch[1] : 'Uncategorized';
      // Apply fix for broken image URLs
      currentLogo = fixImageUrl(logoMatch ? logoMatch[1] : '');
      currentId = idMatch ? idMatch[1] : '';
      currentName = name;
    } else if (!line.startsWith('#')) {
      // It's a URL
      // Check for Series info (Sxx Exx)
      const seriesMatch = currentName.match(/^(.*?)\s+S(\d+)\s*E(\d+)/i);
      let seriesCheck: Partial<Channel> = {};
      
      if (seriesMatch) {
         seriesCheck = {
            seriesName: seriesMatch[1].trim(),
            season: parseInt(seriesMatch[2], 10),
            episode: parseInt(seriesMatch[3], 10)
         };
      }

      channels.push({
        id: currentId || `ch-${channels.length}`,
        name: currentName || 'Unknown Channel',
        group: currentGroup,
        logo: currentLogo,
        url: line,
        ...seriesCheck
      });
      
      // Reset temporary variables just in case, though usually EXTINF comes right before
      currentGroup = 'Uncategorized';
      currentLogo = '';
      currentId = '';
      currentName = '';
    }
  }

  return channels;
}
