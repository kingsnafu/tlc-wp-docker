import markdownIt from 'markdown-it';

const md = markdownIt({ html: true, linkify: true, typographer: true });

export default function(eleventyConfig) {
  // Passthrough copy
  eleventyConfig.addPassthroughCopy({ 'src/css': 'css' });
  eleventyConfig.addPassthroughCopy({ 'src/js': 'js' });
  eleventyConfig.addPassthroughCopy({ 'images': 'images' });

  // Markdown filter — renders markdown strings to HTML
  eleventyConfig.addFilter('markdown', (str) => str ? md.render(str) : '');

  // Date filter
  eleventyConfig.addFilter('dateFormat', (dateStr, format) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (format === 'short') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (format === 'long') return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    return d.toISOString().slice(0, 10);
  });

  // Slug filter
  eleventyConfig.addFilter('slug', (str) => {
    return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  });

  // Limit filter
  eleventyConfig.addFilter('limit', (arr, n) => (arr || []).slice(0, n));

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data',
    },
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
  };
}
