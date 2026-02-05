const fs = require('fs');
const html = fs.readFileSync('uploads/tiktok-debug-1770223504932.html', 'utf8');

// Find __UNIVERSAL_DATA_FOR_REHYDRATION__ script
const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/);

if (match && match[1]) {
  try {
    const data = JSON.parse(match[1]);
    const scope = data.__DEFAULT_SCOPE__ || {};
    
    console.log('Found data keys:', Object.keys(scope));
    
    // Look for video data
    const userDetail = scope['webapp.user-detail'] || {};
    console.log('\nUser detail keys:', Object.keys(userDetail));
    
    if (userDetail.userInfo) {
      console.log('\nUser:', userDetail.userInfo.uniqueId || userDetail.userInfo.nickname);
      console.log('Video count:', userDetail.userInfo.stats?.videoCount || 0);
    }
    
    // Look for ItemList or videos
    const itemList = scope['webapp.video-list'] || scope['webapp.user-post'] || {};
    console.log('\nItem list keys:', Object.keys(itemList));
    
  } catch (e) {
    console.error('Parse error:', e.message);
  }
} else {
  console.log('No __UNIVERSAL_DATA_FOR_REHYDRATION__ found');
}
