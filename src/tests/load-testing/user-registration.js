import http from 'k6/http';
import { check } from 'k6';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  vus: 10,
  duration: '10s',
  thresholds: {
    'http_req_duration{name:Register}': ['p(95)<500'],
    'http_req_failed{name:Register}': ['rate<0.01'],
  },
};

export default function () {
  const username = `user_${randomString(10)}`;
  const email = `${randomString(10)}@example.com`;
  const password = 'password123';

  const payload = JSON.stringify({
    username: username,
    email: email,
    password: password,
  });

  const res = http.post('https://jpeg.gateway/auth/register', payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'Register' },
  });

  check(res, {
    'Register: status is 201': (r) => r.status === 201,
    'Register: response time is acceptable': (r) => r.timings.duration < 500,
  });
}