const response = await fetch('https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    searchQueries: [keyword],
    maxVideos: maxVideos,
    sort: 'views',
    maxVideoAge: days
  })
});

if (!response.ok) throw new Error('Failed to start Apify task');

const runData = await response.json();
const runId = runData.data.id;

let attempts = 0;
let results = null;

while (attempts < 30) {
  await new Promise(resolve => setTimeout(resolve, 1000));

  const statusResponse = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs/${runId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });

  const statusData = await statusResponse.json();

  if (statusData.data.status === 'SUCCEEDED') {
    const resultsResponse = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs/${runId}/dataset/items`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    results = await resultsResponse.json();
    break;
  } else if (statusData.data.status === 'FAILED') {
    throw new Error('Apify task failed');
  }

  attempts++;
}

if (!results) throw new Error('Timeout waiting for results');

const formattedVideos = results.slice(0, maxVideos).map(video => ({
  id: video.id,
  desc: video.text || video.desc || '',
  stats: {
    playCount: video.playCount || 0,
    shareCount: video.shareCount || 0,
    diggCount: video.diggCount || 0,
    commentCount: video.commentCount || 0
  },
  createTime: video.createTime || Date.now() / 1000,
  author: {
    uniqueId: video.authorMeta?.name || 'unknown'
  },
  webVideoUrl: video.webVideoUrl || '#',
  coverUrl: video.covers?.default || video.videoMeta?.cover || ''
}));

return {
  statusCode: 200,
  headers,
  body: JSON.stringify({ videos: formattedVideos })
};