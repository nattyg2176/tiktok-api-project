exports.handler = async function(event, context) {
  const apiKey = process.env.APIFY_API_KEY;

  try {
    const { keyword, maxVideos = 10, days = 7 } = JSON.parse(event.body);

    const response = await fetch('https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        searchQueries: [keyword],
        maxVideos,
        sort: 'views',
        maxVideoAge: days
      })
    });

    if (!response.ok) {
      console.error('Failed to start Apify task:', response.status);
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to start Apify task' }) };
    }

    const runData = await response.json();
    const runId = runData.data.id;

    let attempts = 0;
    let results = null;

    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time

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
        console.error('Apify task failed');
        return { statusCode: 500, body: JSON.stringify({ error: 'Apify task failed' }) };
      }

      attempts++;
    }

    if (!results || results.length === 0) {
      console.error('No results or timeout');
      return { statusCode: 500, body: JSON.stringify({ error: 'Timeout waiting for results' }) };
    }

    // Fixed field mappings for Clockworks scraper
    const formattedVideos = results.slice(0, maxVideos).map(video => ({
      id: video.id || video.videoId || 'unknown',
      desc: video.text || video.description || video.desc || 'No description available',
      stats: {
        playCount: video.playCount || video.plays || video.viewCount || 0,
        shareCount: video.shareCount || video.shares || 0,
        diggCount: video.diggCount || video.likes || video.heartCount || 0,
        commentCount: video.commentCount || video.comments || 0
      },
      createTime: video.createTime || video.timestamp || Math.floor(Date.now() / 1000),
      author: {
        uniqueId: video.authorMeta?.name || video.author?.uniqueId || video.username || 'unknown'
      },
      webVideoUrl: video.webVideoUrl || video.url || '#',
      coverUrl: video.covers?.default || video.videoMeta?.cover || video.thumbnail || ''
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ videos: formattedVideos })
    };

  } catch (error) {
    console.error('Function error:', error);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Internal server error: ' + error.message }) 
    };
  }
};