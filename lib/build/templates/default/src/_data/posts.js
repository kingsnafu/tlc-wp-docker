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
      // Ensure date is a Date object (Eleventy 3.x requires it for sorting)
      if (data.date && typeof data.date === 'string') data.date = new Date(data.date);
      return { ...data, content, fileName: f };
    }).sort((a, b) => (b.date || 0) - (a.date || 0));
  } catch {
    return [];
  }
}
