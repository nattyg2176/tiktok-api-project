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

    const runSync = await fetch('https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync', {
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

    const runData = await runSync.json();

    if (!runSync.ok || !runData.data?.defaultDatasetId) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Could not run Apify actor' })
      };
    }

    const resultRes = await fetch(`https://api.apify.com/v2/datasets/${runData.data.defaultDatasetId}/items?clean=true`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const results = await resultRes.json();

    if (!results || results.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ message: 'No viral videos found for this query.' })
      };
    }

    const formatted = results.slice(0, maxVideos).map(video => ({
      id: video.id || 'unknown',
      desc: video.text || 'No description',
      stats: {
        playCount: video.playCount || 0,
        shareCount: video.shareCount || 0,
        diggCount: video.diggCount || 0,
        commentCount: video.commentCount || 0
      },
      author: {
        name: video.authorMeta?.name || 'unknown',
        avatar: video.authorMeta?.avatar || ''
      },
      webVideoUrl: video.webVideoUrl || '',
      coverUrl: video.videoMeta?.cover || ''
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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error: ' + error.message })
    };
  }
};
