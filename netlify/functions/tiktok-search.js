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

    // Debug logging
    console.log('Received request:', { keyword, maxVideos, days });
    console.log('API Key exists:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);

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

    // Start the actor run with correct parameters
    console.log('Starting Apify actor...');
    const runResponse = await fetch('https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        hashtags: [keyword],
        resultsPerPage: maxVideos,
        proxyCountryCode: "None"
      })
    });

    console.log('Run response status:', runResponse.status);
    const runResponseText = await runResponse.text();
    console.log('Run response body:', runResponseText);

    if (!runResponse.ok) {
      console.error('Apify run failed:', runResponseText);
      return {
        statusCode: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Apify actor run failed', 
          details: runResponseText,
          status: runResponse.status 
        })
      };
    }

    const runData = JSON.parse(runResponseText);
    const runId = runData.data.id;
    console.log('Run ID:', runId);

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
      console.log(`Attempt ${attempts + 1}: Status = ${status}`);
      attempts++;
    }

    if (status !== 'SUCCEEDED') {
      console.error('Scraping failed. Final status:', status);
      return {
        statusCode: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          error: 'Scraping failed or timed out',
          finalStatus: status 
        })
      };
    }

    // Get results
    console.log('Fetching results...');
    const resultsResponse = await fetch(`https://api.apify.com/v2/datasets/${runData.data.defaultDatasetId}/items`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const results = await resultsResponse.json();
    console.log('Results count:', results.length);

    if (!results || results.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ videos: [], message: 'No videos found for this hashtag.' })
      };
    }

    // Format the results with all possible field names
    const formatted = results.slice(0, maxVideos).map(video => {
      console.log('Raw video data:', JSON.stringify(video).substring(0, 200));
      
      return {
        id: video.id || video.videoId || 'unknown',
        desc: video.text || video.description || video.desc || 'No description',
        stats: {
          playCount: video.playCount || video.stats?.playCount || 0,
          shareCount: video.shareCount || video.stats?.shareCount || 0,
          diggCount: video.diggCount || video.stats?.diggCount || video.likeCount || 0,
          commentCount: video.commentCount || video.stats?.commentCount || 0
        },
        author: {
          name: video.authorMeta?.name || video.author?.uniqueId || video.author?.nickname || 'unknown',
          avatar: video.authorMeta?.avatar || video.author?.avatarThumb || ''
        },
        webVideoUrl: video.webVideoUrl || video.link || '',
        coverUrl: video.videoMeta?.cover || video.video?.cover || video.covers?.default || ''
      };
    });

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
    console.error('Error details:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Server error', 
        message: error.message,
        stack: error.stack 
      })
    };
  }
};