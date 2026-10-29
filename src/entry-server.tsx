import { renderToStaticMarkup } from 'react-dom/server';
import { GuidePage, GuidesPage, guides } from './guides';

export { guides };
export function renderGuides(slug?: string) {
  const guide = guides.find(item => item.slug === slug);
  if (slug && !guide) throw new Error(`Unknown guide: ${slug}`);
  return renderToStaticMarkup(guide ? <GuidePage guide={guide}/> : <GuidesPage/>);
}
