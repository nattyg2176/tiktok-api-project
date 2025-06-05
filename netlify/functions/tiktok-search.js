const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const apiKey = process.env.APIFY_API_KEY;

  try {
    const { keyword, maxVideos = 10, days = 7 } = JSON.parse(event.body);

    if (!keyword) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing keyword' }),
      };
    }

    const startResponse = await fetch('https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs', {
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

    const runStart = await startResponse.json();

    if (!startResponse.ok || !runStart.data?.id) {
      console.error('❌ Failed to start Apify run:', runStart);
      return { statusCode: 502, body: JSON.stringify({ error: 'Could not start Apify actor' }) };
    }

    const runId = runStart.data.id;
    let attempts = 0;
    let results = null;

    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      const statusData = await statusRes.json();
      const status = statusData.data?.status;

      if (!statusRes.ok || !status) {
        console.error('❌ Error checking status:', statusData);
        return { statusCode: 502, body: JSON.stringify({ error: 'Could not check run status' }) };
      }

      if (status === 'SUCCEEDED') {
        const resultRes = await fetch(`https://api.apify.com/v2/datasets/${statusData.data.defaultDatasetId}/items`, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!resultRes.ok) {
          console.error('❌ Failed to get dataset items');
          return { statusCode: 502, body: JSON.stringify({ error: 'Failed to load dataset results' }) };
        }

        results = await resultRes.json();
        break;
      }

      if (status === 'FAILED') {
        console.error('❌ Apify actor failed');
        return { statusCode: 502, body: JSON.stringify({ error: 'Apify run failed' }) };
      }

      attempts++;
    }

    if (!results || results.length === 0) {
      console.error('❌ No videos found for that niche.');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'No viral videos found for this niche. Try a broader keyword.' })
      };
    }

    const formatted = results.slice(0, maxVideos).map(video => ({
      id: video.id || video.videoId || 'unknown',
      desc: video.text || video.description || video.desc || 'No description',
      stats: {
        playCount: video.playCount || video.viewCount || 0,
        shareCount: video.shareCount || video.shares || 0,
        diggCount: video.diggCount || video.likes || video.heartCount || 0,
        commentCount: video.commentCount || video.comments || 0
      },
      createTime: video.createTime || video.timestamp || Math.floor(Date.now() / 1000),
      author: {
        uniqueId: video.authorMeta?.name || video.author?.uniqueId || video.username || 'unknown'
      },
      webVideoUrl: video.webVideoUrl || video.url || '',
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
      body: JSON.stringify({ videos: formatted })
    };

  } catch (error) {
    console.error('❌ Server error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error: ' + error.message })
    };
  }
};