import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

/**
 * tsx 脚本（migrate / seed / reset）不像 Next 那样自动加载 .env.local。
 * 这个模块只负责副作用：必须在 import 其它模块之前**第一个**被 import。
 */
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) loadEnvFile(file);
}
