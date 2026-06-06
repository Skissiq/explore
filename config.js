// Google Cloud Console 設定
// 1. 前往 https://console.cloud.google.com/apis/credentials 建立 OAuth 2.0 用戶端 ID (網頁應用程式)
// 2. 啟用 Google Drive API
// 3. 將下方的 CLIENT_ID 改為你的用戶端 ID
// 4. 部署 Apps Script 後端後，將部署網址填入 APPS_SCRIPT_URL

var CONFIG = {
  // Google OAuth 用戶端 ID
  CLIENT_ID: '568538555158-1vli43gj6i7on3mn5e1vpt0sjbhvp9tn.apps.googleusercontent.com',

  // Apps Script 部署網址 (部署後端後產生)
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxX9n8s1Z5l3m2v7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9/exec',

  // 輪詢間隔 (毫秒) - 檢查新訊息的頻率
  POLL_INTERVAL: 3000
};
