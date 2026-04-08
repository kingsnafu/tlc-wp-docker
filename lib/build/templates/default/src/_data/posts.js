import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import matter from 'gray-matter';

export default function() {
  const dir = resolve(process.cwd(), 'content', 'posts');
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    return files.map(f => {
      const raw = readFileSync(join(dir, f), 'utf8');
      const { data, content } = matter(raw);
      return { ...data, content, fileName: f };
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch {
    return [];
  }
}
