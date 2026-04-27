import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
});

// Add retry logic — if first request fails, retry once after 2 seconds
client.interceptors.response.use(
  response => response,
  async error => {
    const config = error.config;
    if (!config._retried && (error.code === 'ERR_NETWORK' || error.response?.status >= 500)) {
      config._retried = true;
      await new Promise(r => setTimeout(r, 2000));
      return client(config);
    }
    return Promise.reject(error);
  }
);

export default client;
