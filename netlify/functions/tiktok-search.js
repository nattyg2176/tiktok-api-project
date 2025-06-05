exports.handler = async function(event, context) {
  const apiKey = process.env.APIFY_API_KEY;

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { keyword, maxVideos = 10, days = 7 } = JSON.parse(event.body);

    if (!keyword) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Missing keyword' }),
      };
    }

    if (!apiKey) {
      console.error('API Key is missing!');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'API configuration error - missing API key' }),
      };
    }

    // Start the actor run
    const runResponse = await fetch('https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        hashtags: [keyword],
        resultsPerPage: maxVideos,
        proxyCountryCode: "None",
        shouldDownloadCovers: false,
        shouldDownloadVideos: false
      })
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('Apify run failed:', errorText);
      throw new Error(`Apify error: ${runResponse.status}`);
    }

    const runData = await runResponse.json();
    const runId = runData.data.id;

    // Wait for the run to complete
    let status = 'RUNNING';
    let attempts = 0;
    const maxAttempts = 30;

    while (status === 'RUNNING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      const statusData = await statusResponse.json();
      status = statusData.data.status;
      attempts++;
    }

    if (status !== 'SUCCEEDED') {
      throw new Error('Scraping failed or timed out');
    }

    // Get results
    const resultsResponse = await fetch(`https://api.apify.com/v2/datasets/${runData.data.defaultDatasetId}/items`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const results = await resultsResponse.json();

    if (!results || results.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ videos: [] })
      };
    }

    // Format the results - CRITICAL: Include uniqueId
    const formatted = results.slice(0, maxVideos).map(video => ({
      id: video.id || video.videoId || 'unknown',
      desc: video.text || video.description || video.desc || 'No description',
      stats: {
        playCount: video.playCount || video.stats?.playCount || 0,
        shareCount: video.shareCount || video.stats?.shareCount || 0,
        diggCount: video.diggCount || video.stats?.diggCount || video.likeCount || 0,
        commentCount: video.commentCount || video.stats?.commentCount || 0
      },
      author: {
        uniqueId: video.authorMeta?.name || video.author?.uniqueId || video.author?.nickname || 'unknown',
        name: video.authorMeta?.name || video.author?.uniqueId || video.author?.nickname || 'unknown',
        avatar: video.authorMeta?.avatar || video.author?.avatarThumb || ''
      },
      webVideoUrl: video.webVideoUrl || video.link || '',
      coverUrl: video.videoMeta?.cover || video.video?.cover || video.covers?.default || ''
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
    console.error('Error:', error.message);
    // Return empty videos array instead of error to trigger demo data
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ videos: [] })
    };
  }
};