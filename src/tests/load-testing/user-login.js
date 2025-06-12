import http from 'k6/http';
import { check, group } from 'k6';

export const options = {
  vus: 1000,
  duration: '10s',
  thresholds: {
    'http_req_duration{name:Login}': ['p(95)<500'],
    'http_req_duration{name:GetProfile}': ['p(95)<300'],
    'http_req_failed': ['rate<0.01'],
  },
};

function userLogin(email, password) {
  const loginPayload = JSON.stringify({ email: email, password: password });
  const loginRes = http.post('https://jpeg.gateway/auth/login', loginPayload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'Login' },
  });

  check(loginRes, { 'Login: status is 200': (r) => r.status === 200 });

  if (loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    return body.token;
  }
  return null;
}

export default function () {
  group('User Login and Profile', () => {
    const email = 'newuser123@example.com';
    const password = 'myPassword';
    const token = userLogin(email, password);

    if (token) {
      group('Get User Profile', () => {
        const profileRes = http.get('https://jpeg.gateway/users/me', {
          headers: { Authorization: `Bearer ${token}` },
          tags: { name: 'GetProfile' },
        });
        check(profileRes, { 'Get Profile: status is 200': (r) => r.status === 200 });
        check(profileRes, { 'Get Profile: response time is acceptable': (r) => r.timings.duration < 300 });
      });
    }
  });
}