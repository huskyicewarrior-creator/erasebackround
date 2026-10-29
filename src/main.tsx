import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, Check, Clipboard, Code2, ImagePlus, LoaderCircle, MoveHorizontal, RotateCcw, Scissors, X } from 'lucide-react';
import { GuidePage, GuidesPage, guides } from './guides';
import './style.css';

type Mode = 'auto' | 'model' | 'green';
type State = 'empty' | 'uploading' | 'queued' | 'processing' | 'complete' | 'error';
type Job = { id: string; token: string };
const API = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';
const MAX_SIZE = 10 * 1024 * 1024;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function errorMessage(response: Response) {
  try { const data = await response.json(); return typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.'; }
  catch { return 'Something went wrong. Please try again.'; }
}
function apiUrl(path: string) { if (!API) throw new Error('The image service is not configured yet. Please try again later.'); return `${API}${path}`; }
function Brand() { return <a className="brand" href="/" aria-label="erasebackround.com home"><span className="brand-mark"><Scissors size={18} strokeWidth={2.3} /></span><span>erasebackround<span className="brand-domain">.com</span></span></a>; }
function Header() { return <header className="header"><Brand /><nav aria-label="Main navigation"><a href="/guides">Guides</a><a href="/api">For developers <ArrowRight size={14} /></a><a className="nav-about" href="/#how">How it works</a></nav></header>; }
function Footer() { return <footer className="footer"><div className="footer-top"><Brand /><p>Make room for what matters.</p></div><div className="footer-bottom"><span>Made for the things you're making.</span><div><a href="/guides">Guides</a><a href="/api">API docs</a><a href="/privacy">Privacy</a></div></div></footer>; }

function App({ onPasteToStudio }: { onPasteToStudio: () => void }) {
  const [state, setState] = useState<State>('empty');
  const [mode, setMode] = useState<Mode>('auto');
  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState('');
  const [result, setResult] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [message, setMessage] = useState('');
  const [method, setMethod] = useState('');
  const [compare, setCompare] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const jobRef = useRef<Job | null>(null);
  const originalRef = useRef('');
  const resultRef = useRef('');

  const abandon = useCallback((active: Job | null) => {
    if (active && API) void fetch(`${API}/v1/jobs/${active.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${active.token}` } }).catch(() => {});
  }, []);
  const reset = useCallback(() => {
    generation.current += 1;
    abandon(jobRef.current); jobRef.current = null;
    if (originalRef.current) URL.revokeObjectURL(originalRef.current);
    if (resultRef.current) URL.revokeObjectURL(resultRef.current);
    originalRef.current = ''; resultRef.current = '';
    setFile(null); setOriginal(''); setResult(''); setResultBlob(null); setMessage(''); setState('empty'); setCompare(false); setCopied(false);
    if (input.current) input.current.value = '';
  }, [abandon]);
  useEffect(() => () => { generation.current += 1; abandon(jobRef.current); if (originalRef.current) URL.revokeObjectURL(originalRef.current); if (resultRef.current) URL.revokeObjectURL(resultRef.current); }, [abandon]);

  const start = useCallback(async (selected: File, selectedMode: Mode) => {
    generation.current += 1;
    const current = generation.current;
    abandon(jobRef.current); jobRef.current = null;
    if (originalRef.current) URL.revokeObjectURL(originalRef.current);
    if (resultRef.current) URL.revokeObjectURL(resultRef.current);
    const url = URL.createObjectURL(selected); originalRef.current = url; resultRef.current = '';
    setOriginal(url); setResult(''); setResultBlob(null); setFile(selected); setCompare(false); setCopied(false); setMessage(''); setMethod('');
    if (selected.size > MAX_SIZE) { setState('error'); setMessage('This image is over 10 MB. Choose a smaller file and try again.'); return; }
    const extension = selected.name.split('.').pop()?.toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(extension || '') && !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(selected.type)) {
      setState('error'); setMessage('Choose a JPEG, PNG, WebP or AVIF still image.'); return;
    }
    setState('uploading');
    try {
      const body = new FormData(); body.append('file', selected);
      const response = await fetch(apiUrl(`/v1/jobs?mode=${selectedMode}`), { method: 'POST', body });
      if (!response.ok) throw new Error(await errorMessage(response));
      const created: Job = await response.json();
      if (current !== generation.current) { abandon(created); return; }
      jobRef.current = created; setState('queued');
      const headers = { Authorization: `Bearer ${created.token}` };
      while (current === generation.current) {
        await sleep(1200);
        const statusResponse = await fetch(apiUrl(`/v1/jobs/${created.id}`), { headers });
        if (!statusResponse.ok) throw new Error(await errorMessage(statusResponse));
        const status: { status: string; error?: string; method?: string } = await statusResponse.json();
        if (current !== generation.current) return;
        if (status.status === 'failed') throw new Error(status.error || 'Processing failed. Please try another image.');
        if (status.status === 'cancelled') return;
        if (status.status === 'processing') setState('processing');
        if (status.status === 'complete') {
          const resultResponse = await fetch(apiUrl(`/v1/jobs/${created.id}/result`), { headers });
          if (!resultResponse.ok) throw new Error(await errorMessage(resultResponse));
          const blob = await resultResponse.blob();
          if (current !== generation.current) return;
          const resultUrl = URL.createObjectURL(blob); resultRef.current = resultUrl;
          setResultBlob(blob); setResult(resultUrl); setMethod(status.method || 'model'); setState('complete'); return;
        }
      }
    } catch (error) {
      if (current !== generation.current) return;
      setState('error'); setMessage(error instanceof TypeError ? 'Could not reach the image service. Check your connection or try again later.' : error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    }
  }, [abandon]);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ((target instanceof HTMLInputElement && target.type !== 'file') || target instanceof HTMLTextAreaElement || target.isContentEditable)) return;
      const item = Array.from(event.clipboardData?.items || []).find(entry => entry.kind === 'file' && entry.type.startsWith('image/'));
      const pasted = item?.getAsFile();
      if (pasted) { event.preventDefault(); onPasteToStudio(); void start(pasted, mode); }
    };
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste);
  }, [mode, onPasteToStudio, start]);

  const copy = async () => {
    try { if (!resultBlob || !navigator.clipboard?.write || !window.ClipboardItem) throw new Error(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': resultBlob })]); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch { setMessage('Copying images is not available here. Download the PNG instead.'); }
  };
  const busy = ['uploading', 'queued', 'processing'].includes(state);
  return <><Header /><main>
    <section className="hero" id="upload">
      <div className="hero-copy"><div className="availability"><span className="status-dot" /> A little less background. A lot more you.</div><h1>Make space for<br /><em>the good stuff.</em></h1><p>Remove the background, keep the best part. A simple image tool for the things you’re making.</p><a className="text-link" href="#how">See how it works <ArrowDown size={16}/></a><div className="hero-note"><span className="note-line" /><span>NO ACCOUNT NEEDED<br />JUST AN IMAGE AND AN IDEA</span></div></div>
      <div className="workspace" onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); const dropped = e.dataTransfer.files[0]; if (dropped) void start(dropped, mode); }}>
        <div className="workspace-top"><span><span className="workspace-dot" /> THE CUTOUT STUDIO</span><span>01 / 01</span></div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" className="sr-only" onChange={e => { const selected = e.target.files?.[0]; if (selected) void start(selected, mode); }} />
        {state === 'empty' ? <div className={`drop-zone ${dragging ? 'is-dragging' : ''}`}>
          <div className="drop-art" aria-hidden="true"><div className="art-sheet back" /><div className="art-sheet front"><ImagePlus size={30} strokeWidth={1.25} /></div><span className="art-spark">✳</span></div>
          <h2>Start with an image.</h2><p>Drop a file here, or choose one to upload.</p><button className="button primary" onClick={() => input.current?.click()}><ImagePlus size={18} /> Choose an image <ArrowRight size={16}/></button><div className="paste-hint"><Clipboard size={14} /> Or paste an image from your clipboard</div>
        </div> : <div className="working-area">
          <div className="image-stage checkerboard">{(compare ? original : result || original) && <img src={compare ? original : result || original} alt={compare || !result ? 'Original uploaded image' : 'Image with background removed'} />}{busy && <div className="stage-overlay"><LoaderCircle className="spin" size={25}/><strong>{state === 'uploading' ? 'Uploading image' : state === 'queued' ? 'Waiting in line' : 'Removing background'}</strong><span>{state === 'queued' ? 'Your image is queued for the Pi.' : state === 'processing' ? 'This can take a little while.' : 'Getting your image ready.'}</span></div>}</div>
          <div className="file-row"><div className="file-info"><span className="file-icon"><ImagePlus size={16}/></span><span><strong>{file?.name || 'Pasted image'}</strong><small>{state === 'complete' ? `Ready · ${method === 'green' ? 'green screen' : 'general image'}` : state === 'error' ? 'Needs your attention' : 'Working on it'}</small></span></div><button className="icon-button" onClick={reset} aria-label={busy ? 'Cancel and start again' : 'Remove image'}><X size={18}/></button></div>
          {state === 'complete' && <div className="result-actions"><button className="button secondary" onClick={() => setCompare(!compare)}><MoveHorizontal size={17}/>{compare ? 'Show cutout' : 'Show original'}</button><button className="button secondary copy-button" onClick={() => void copy()}>{copied ? <Check size={17}/> : <Clipboard size={17}/>} {copied ? 'Copied' : 'Copy'}</button><a className="button primary download" href={result} download={`${file?.name.replace(/\.[^.]+$/, '') || 'image'}-cutout.png`}><ArrowDownToLine size={17}/> Download PNG</a></div>}
          {state === 'error' && <div className="error-box" role="alert"><strong>Couldn’t finish this one.</strong><span>{message}</span><div><button onClick={() => input.current?.click()}>Choose another</button>{file && <button onClick={() => void start(file, mode)}>Try again</button>}</div></div>}
          {state !== 'error' && message && <p className="inline-message" role="status">{message}</p>}
          {busy && <button className="cancel-button" onClick={reset}>Cancel and start over</button>}
        </div>}
        <div className="workspace-bottom"><span>JPEG · PNG · WEBP · AVIF</span><span>UP TO 10 MB</span></div>
      </div>
    </section>
    <div className="tool-options"><div><strong>Need a different cut?</strong><span>Choose how we find the background.</span></div><label htmlFor="mode">Processing mode</label><select id="mode" value={mode} onChange={e => setMode(e.target.value as Mode)} disabled={busy}><option value="auto">Automatic</option><option value="model">General image</option><option value="green">Green screen</option></select>{file && !busy && <button onClick={() => void start(file, mode)}><RotateCcw size={14}/> Reprocess</button>}</div>
    <section className="how" id="how"><div className="section-heading"><div><span className="section-label">A BETTER KIND OF SHORTCUT</span><h2>Less editing.<br /><em>More making.</em></h2></div><p>Good tools get out of your way. This one takes care of the background so you can get back to whatever comes next.</p></div><div className="steps"><div><span className="step-num">01</span><h3>Drop it in</h3><p>Upload, drag and drop, or paste an image straight from your clipboard.</p></div><div><span className="step-num">02</span><h3>We do the cutting</h3><p>Your image is processed on our small, self-hosted service. No account, no detours.</p></div><div><span className="step-num">03</span><h3>Make it yours</h3><p>Download a transparent PNG or copy it and keep creating.</p></div></div></section>
    <section className="dev-section"><div><div className="dev-icon"><Code2 size={21}/></div><h2>Made with developers<br /><em>in mind.</em></h2><p>Prefer the command line? Put the same background removal to work in your own workflow.</p><a className="button dark" href="/api">Explore the API <ArrowRight size={17}/></a></div><div className="code-window"><div className="code-top"><span><i/><i/><i/></span><span>YOUR TERMINAL</span></div><pre><code><span className="code-muted"># A little less background</span>{'\n'}curl -X POST "$API/v1/jobs" \\{'\n'}{'  '}-F "file=@image.png"</code></pre><div className="code-bottom"><span>IMAGE IN</span><ArrowRight size={16}/><span>TRANSPARENT PNG OUT</span></div></div></section>
    <section className="closing"><span className="closing-mark"><Scissors size={23}/></span><h2>Ready when you are.</h2><p>One image. One less background.</p><a className="button primary" href="#upload">Start cutting <ArrowRight size={16}/></a></section>
  </main><Footer /></>;
}

function DocumentPage({ page }: { page: 'api' | 'privacy' | '404' }) {
  if (page === '404') return <><Header/><main className="notfound"><span className="notfound-number">404<span>.</span></span><h1>Nothing to see here.</h1><p>Looks like this page got cut out. Let’s get you back to making.</p><a href="/" className="button primary"><ArrowLeft size={16}/> Back to the studio</a></main><Footer/></>;
  return <><Header/><main className="document"><a className="back-link" href="/"><ArrowLeft size={15}/> Back to the studio</a>{page === 'api' ? <><h1>A little API.<br/><em>A lot of possibility.</em></h1><p className="document-lead">Use the same image processing from your own tools. Jobs are asynchronous, and each result is protected by a short-lived access token.</p><div className="doc-rule"/><h2>Before you begin</h2><p>Set <code>API</code> to the HTTPS address of the configured image service. JPEG, PNG, WebP and AVIF still images are supported, up to 10 MB and 12 megapixels. Limits may change with capacity.</p><h2>1. Create a job</h2><pre><code>{`curl -X POST "$API/v1/jobs?mode=auto" \\
  -F "file=@image.png"`}</code></pre><p>The response contains an <code>id</code> and a secret <code>token</code>. Keep the token private. Modes are <code>auto</code>, <code>model</code>, and <code>green</code>.</p><h2>2. Check its status</h2><pre><code>{`curl "$API/v1/jobs/$ID" \\
  -H "Authorization: Bearer $TOKEN"`}</code></pre><p>Poll until the status is <code>complete</code>. Other states include <code>queued</code>, <code>processing</code>, <code>failed</code> and <code>cancelled</code>.</p><h2>3. Download your PNG</h2><pre><code>{`curl "$API/v1/jobs/$ID/result" \\
  -H "Authorization: Bearer $TOKEN" \\
  -o cutout.png`}</code></pre><p>Results expire after approximately 15 minutes. To cancel a job or delete a completed result, send <code>DELETE</code> to the job URL using the same authorization header. Active processing may finish before its result is discarded.</p><h2>Limits and errors</h2><p>This service runs on a small machine. Requests may receive 429 when the usage limit is reached, 503 when the queue is full or the service is starting, or 400/413 for invalid or oversized images. Wait and retry when appropriate. Never include your job token in a public URL or log.</p></> : <><h1>Your images.<br/><em>Your business.</em></h1><p className="document-lead">A straightforward explanation of how this service is designed to handle your images.</p><div className="doc-rule"/><h2>What happens to an image</h2><p>When you submit an image, it is sent over HTTPS to the self-hosted processing service. The service stores a temporary input while it works, then deletes that input. The resulting PNG is held temporarily so you can download it, and is deleted after approximately 15 minutes or when you remove it. Temporary files are also cleaned up after a service restart.</p><h2>Service data</h2><p>The service uses IP addresses in memory to limit abuse and keep the queue available. The frontend host, tunnel provider, and network infrastructure may process connection information and retain their own operational logs according to their settings. Images and job access tokens are not intentionally included in application logs. Do not upload an image you are not comfortable sending to the service operator.</p><h2>Accounts, analytics and advertising</h2><p>No account, analytics, or advertising is included in this version. If that changes, this notice must be updated before those features are enabled.</p><h2>About this notice</h2><p>This is a pre-launch notice. The operator's identity, contact details, hosting configurations and provider retention settings must be confirmed before public launch. This page is not legal advice.</p></>}</main><Footer/></>;
}
function Root() {
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/$/, '') || '/');
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname.replace(/\/$/, '') || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const onPasteToStudio = useCallback(() => {
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
      setPath('/');
    }
    requestAnimationFrame(() => document.getElementById('upload')?.scrollIntoView());
  }, []);
  const guide = guides.find(item => path === `/guides/${item.slug}`);
  return <><div hidden={path !== '/'}><App onPasteToStudio={onPasteToStudio}/></div>{path === '/guides' ? <><Header/><GuidesPage/><Footer/></> : guide ? <><Header/><GuidePage guide={guide}/><Footer/></> : path !== '/' && <DocumentPage page={path === '/api' ? 'api' : path === '/privacy' ? 'privacy' : '404'}/>}</>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Root/></React.StrictMode>);
