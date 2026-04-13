import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import matter from 'gray-matter';

export default function() {
  const dir = resolve(process.cwd(), 'content', 'pages');
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    return files.map(f => {
      const raw = readFileSync(join(dir, f), 'utf8');
      const { data, content } = matter(raw);
      if (data.date && typeof data.date === 'string') data.date = new Date(data.date);
      return { ...data, content, fileName: f };
    }).sort((a, b) => (a.menu_order || 0) - (b.menu_order || 0));
  } catch {
    return [];
  }
}
