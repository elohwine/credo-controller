const ngrok = require('ngrok');

async function testNgrok() {
  try {
    const url = await ngrok.connect(3000);
    console.log('ngrok URL:', url);
    await ngrok.disconnect(url);
    await ngrok.kill();
  } catch (error) {
    console.error('ngrok error:', error);
  }
}

testNgrok();
