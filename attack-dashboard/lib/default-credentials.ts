export type Credential = { email: string; password: string };

const PASSWORDS = [
  'password', '123456', 'admin123', 'letmein', 'qwerty',
  'welcome', 'monkey', 'dragon', 'master', 'abc123',
  'pass1234', 'admin', 'iloveyou', 'sunshine', 'princess',
  'football', 'shadow', 'superman', 'michael', 'baseball',
  'trustno1', 'batman', 'access', 'hello123', 'charlie',
  'donald', 'password1', 'qwerty123', 'p@ssw0rd', 'test1234',
];

export const DEFAULT_CREDENTIALS: Credential[] = Array.from({ length: 100 }, (_, i) => ({
  email: `user${String(i + 1).padStart(3, '0')}@example.com`,
  password: PASSWORDS[i % PASSWORDS.length],
}));

// 77번 항목 (index 76): 실제 데모 계정
DEFAULT_CREDENTIALS[76] = { email: 'victim@demo.com', password: 'Demo1234!' };
