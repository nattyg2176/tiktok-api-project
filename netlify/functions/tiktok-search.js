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

    // Start the actor run
    const runResponse = await fetch('https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        searchTerms: [keyword],
        resultsPerPage: maxVideos,
        maxPostDate: new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
      })
    });

    if (!runResponse.ok) {
      throw new Error(`Apify error: ${runResponse.status}`);
    }

    const runData = await runResponse.json();
    const runId = runData.data.id;

    // Wait for the run to complete
    let status = 'RUNNING';
    let attempts = 0;
    const maxAttempts = 30;

    while (status === 'RUNNING' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs/${runId}`, {
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
    const resultsResponse = await fetch(`https://api.apify.com/v2/acts/emastra~tiktok-scraper/runs/${runId}/dataset/items`, {
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
        body: JSON.stringify({ videos: [], message: 'No viral videos found for this query.' })
      };
    }

    const formatted = results.slice(0, maxVideos).map(video => ({
      id: video.id || 'unknown',
      desc: video.text || video.desc || 'No description',
      stats: {
        playCount: video.playCount || video.stats?.playCount || 0,
        shareCount: video.shareCount || video.stats?.shareCount || 0,
        diggCount: video.diggCount || video.stats?.diggCount || 0,
        commentCount: video.commentCount || video.stats?.commentCount || 0
      },
      author: {
        name: video.authorMeta?.name || video.author?.uniqueId || 'unknown',
        avatar: video.authorMeta?.avatar || video.author?.avatarThumb || ''
      },
      webVideoUrl: video.webVideoUrl || video.link || '',
      coverUrl: video.videoMeta?.cover || video.video?.cover || ''
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
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Server error: ' + error.message })
    };
  }
};