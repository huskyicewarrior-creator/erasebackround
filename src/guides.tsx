import { ArrowLeft, ArrowRight } from 'lucide-react';

type Section = { heading: string; paragraphs: string[] };
type Guide = { slug: string; title: string; description: string; intro: string; sections: Section[] };

export const guides: Guide[] = [
  {
    slug: 'remove-background-from-image',
    title: 'How to remove a background from an image',
    description: 'Learn how to make a transparent PNG from a photo, inspect the edges, and use your cutout in a design or website.',
    intro: 'A transparent cutout makes a photo easier to use in a mockup, a presentation, or a webpage. Here’s a simple way to go from an image to a PNG with transparency.',
    sections: [
      { heading: 'Start with a clear image', paragraphs: ['Choose a JPEG, PNG, WebP, or AVIF still image. A well-lit subject with clear separation from its background is easier to isolate than a blurry image or one where the subject and background look alike.', 'On erasebackround.com, choose a file, drag it into the studio, or paste an image from your clipboard. Processing starts when the image is submitted.'] },
      { heading: 'Check the result before you use it', paragraphs: ['When processing finishes, use Show original to compare the cutout with the source. Look closely around hair, glass, shadows, and other soft or transparent edges: automatic tools can remove details you wanted to keep or leave some background behind.', 'If your photo has a green backdrop, try the Green screen mode. If a green subject is being removed by mistake, select General image and reprocess it instead.'] },
      { heading: 'Save transparency', paragraphs: ['Download the PNG and place it over a light and a dark background to check the edges. The checkerboard in the preview represents transparency; it is not part of the downloaded image.', 'JPEG cannot store transparent pixels. Keep the PNG if you need the background to remain transparent, or flatten it onto a solid color in an image editor if you specifically need a JPEG.'] },
    ],
  },
  {
    slug: 'transparent-png-explained',
    title: 'What is a transparent PNG?',
    description: 'Understand PNG transparency, alpha channels, checkerboards, and why a cutout can show a white background in some apps.',
    intro: 'A transparent PNG can show only the part of an image you want while letting the background underneath show through. The key is its alpha channel.',
    sections: [
      { heading: 'What the alpha channel does', paragraphs: ['In addition to red, green, and blue color information, an image can have an alpha channel that describes opacity. A pixel can be fully opaque, fully transparent, or partly transparent—which helps represent soft edges.', 'A checkerboard in an image editor is usually a visual aid for transparency. It is not the actual background of a properly exported PNG.'] },
      { heading: 'Why a transparent image looks white', paragraphs: ['Some viewers display transparent areas against white or another solid color. Place the PNG on a colored background in an editor or webpage to check it. If you still see a white rectangle, the source may have been flattened or saved without an alpha channel.', 'Also check the format after sharing or converting. JPEG does not support transparency, and a conversion to JPEG will flatten the transparent areas.'] },
      { heading: 'Using a cutout on the web', paragraphs: ['Use a transparent PNG when you need broad compatibility and predictable transparency. WebP and AVIF also support transparency, but check the tools in your workflow before converting.', 'Inspect the edges against more than one background color. A faint light halo can be difficult to notice on white but obvious when the same image is placed on a dark page.'] },
    ],
  },
  {
    slug: 'remove-background-from-avif',
    title: 'How to remove the background from an AVIF image',
    description: 'Use an AVIF still image to create a transparent PNG, with practical tips for input limits, previews, and transparency.',
    intro: 'AVIF is a modern image format used on many websites. If you have an AVIF photo and need a transparent cutout, you can upload the file without first converting it to JPEG.',
    sections: [
      { heading: 'Upload the original file', paragraphs: ['Choose your AVIF file in the studio or drag it into the upload area. The service also accepts JPEG, PNG, and WebP still images. Animated images and video are not supported.', 'The current default limit is 10 MB and 12 megapixels. If a file is rejected for its size or dimensions, resize a copy in an image editor and try again. Keep the original in case you need it later.'] },
      { heading: 'Inspect and download the cutout', paragraphs: ['After processing, compare the output with the original. Automatic segmentation is not perfect: fine hair, low-contrast edges, translucent objects, and subjects close in color to the background can be difficult.', 'Download the result as a transparent PNG. The output is PNG, not AVIF; that makes it easy to use in applications that accept PNG transparency.'] },
      { heading: 'When a paste does not work', paragraphs: ['Clipboard support depends on the browser and on what the source application places on the clipboard. If pasting does not provide image data, save the AVIF file and use the file picker instead.', 'If the preview cannot display an otherwise valid image, try a browser with AVIF support or upload a supported converted copy.'] },
    ],
  },
  {
    slug: 'green-screen-background-removal',
    title: 'Remove a green screen from a still image',
    description: 'Learn when to use green-screen removal, how automatic detection works, and why green subjects need care.',
    intro: 'A green screen can make it easier to separate a subject from its background, but the best result depends on even lighting and a subject that stands apart from the screen.',
    sections: [
      { heading: 'Choose the right mode', paragraphs: ['Automatic mode checks whether green dominates the edges of the image. If it looks like a green screen, the service uses a simple green key; otherwise, it uses the general image model.', 'This is a heuristic, not a guarantee. Choose Green screen to force the key when the automatic choice is wrong, or General image when a green object or background is being mistaken for a screen.'] },
      { heading: 'Watch for green on the subject', paragraphs: ['Green clothing, plants, reflections, and translucent objects can be difficult for a chroma key. The key follows green regions connected to the image edge, but it can still erase green details that touch the backdrop.', 'For better source material, use an evenly lit screen, reduce shadows on it, and keep the subject separated from the background. Avoid reflective surfaces picking up green light where possible.'] },
      { heading: 'Review the edges', paragraphs: ['Compare the original and result, then place the downloaded PNG over a contrasting background. Look for green spill, missing details, and hard edges.', 'The green-screen mode is a lightweight still-image keyer. It is not a replacement for a professional video keying workflow, and it cannot guarantee perfect results for every image.'] },
    ],
  },
  {
    slug: 'paste-image-remove-background',
    title: 'Paste an image to remove its background',
    description: 'Copy an image and paste it into erasebackround.com, then compare and download the transparent result.',
    intro: 'If you already have an image on your clipboard, there is no need to browse for a file first. Paste it into the site and the studio starts processing it.',
    sections: [
      { heading: 'Copy and paste an image', paragraphs: ['Copy an image from a compatible app or webpage. With erasebackround.com open, press Ctrl+V on Windows or Command+V on macOS. The site opens the studio and submits the image when the clipboard contains supported image data.', 'If you are typing in an editable field, normal text pasting is preserved. Browser and operating-system clipboard behavior differs, so a copied image URL or some copied web content may not arrive as an image file.'] },
      { heading: 'Review the result', paragraphs: ['Wait for processing to finish, then use Show original to compare the cutout. Download the PNG or use Copy where your browser supports copying image data.', 'The checkerboard indicates transparent areas. If the subject has green details and automatic mode removes them, choose General image and reprocess.'] },
      { heading: 'If paste is unavailable', paragraphs: ['Save the image to your device and choose it using the upload button, or drag the saved file into the studio. Supported still-image formats are JPEG, PNG, WebP, and AVIF.', 'If the service reports a full queue or connection error, wait and try again. The processing service must be online for the cutout to be generated.'] },
    ],
  },
  {
    slug: 'background-removal-api',
    title: 'Using a background removal API in your workflow',
    description: 'Understand asynchronous image jobs, bearer tokens, PNG downloads, and rate limits in the erasebackround.com API.',
    intro: 'An image-processing API lets a script submit an image and retrieve a cutout without going through the upload interface. The erasebackround.com API uses asynchronous jobs.',
    sections: [
      { heading: 'Submit an image as a job', paragraphs: ['Send a supported still image as multipart form data to the jobs endpoint. The response contains a job ID and a secret token. See the API documentation for a curl example and the complete request paths.', 'Keep the token private: possession of it allows access to that job. Do not put it in a URL, publish it in a repository, or write it to shared logs.'] },
      { heading: 'Poll, then download', paragraphs: ['Check the job status with the bearer token. A job may be queued or processing before it becomes complete. Once complete, request the PNG result using the same token.', 'Results expire after approximately 15 minutes by default. Download the file when it is ready, and send a DELETE request to the job endpoint if you want to cancel or discard it. Active processing may finish before its result is discarded.'] },
      { heading: 'Handle capacity and errors', paragraphs: ['The service runs on a small machine and has a bounded queue. Handle invalid inputs and size limits, and allow a later retry if the server reports a full queue or a rate limit.', 'Use reasonable delays between status requests rather than polling continuously. The service must be deployed and online before a script can reach it.'] },
    ],
  },
  {
    slug: 'product-photo-background-removal',
    title: 'Prepare product photos with transparent backgrounds',
    description: 'Tips for creating usable product cutouts, from shooting a clean source image to checking edges on light and dark backgrounds.',
    intro: 'A transparent product image is useful when the same item needs to sit on different page backgrounds, presentation slides, or design mockups. Start with a good source and always inspect the result.',
    sections: [
      { heading: 'Make the subject easy to separate', paragraphs: ['Use even lighting, a sharp image, and a background that contrasts with the product. Leave some space around the object instead of cropping right up to its edges.', 'Reflective packaging, transparent glass, fur, and very fine details are harder for automatic tools. Keep the original image so you can compare and make manual corrections if needed.'] },
      { heading: 'Create and check the cutout', paragraphs: ['Upload the image to the studio and wait for it to process. Use the original comparison to check that important product details remain visible and that the background was actually removed.', 'Review the PNG on both light and dark backgrounds. Look for halos, leftover shadows, and missing edges. The automatic result may need additional work in an image editor.'] },
      { heading: 'Use the right export', paragraphs: ['Download the transparent PNG for a flexible source file. If your destination requires a solid background or another format, make that conversion in an editor and keep the original transparent PNG.', 'Do not assume that removing a background produces an accurate product representation on its own. Check colors, proportions, and any edited details before publishing.'] },
    ],
  },
  {
    slug: 'image-background-removal-troubleshooting',
    title: 'Troubleshooting background removal',
    description: 'Fix common upload and cutout issues, including unsupported formats, large images, missing details, and full queues.',
    intro: 'Most background-removal problems come down to the source image, the chosen mode, or a service limit. Here are practical things to try before starting over.',
    sections: [
      { heading: 'The image will not upload', paragraphs: ['Check that the file is a still JPEG, PNG, WebP, or AVIF and that it is within the displayed 10 MB upload limit. The default decoded-image limit is 12 megapixels. Animated files and videos are not supported.', 'If a copied image is not detected, save it and use the file picker. A browser may place a URL or rich text on the clipboard instead of image data.'] },
      { heading: 'The wrong parts were removed', paragraphs: ['Compare the result to the original. Hair, transparent material, shadows, and low-contrast edges can be challenging. Try a sharper source image with more contrast, or make corrections in an image editor.', 'Automatic mode can mistake green backgrounds for a screen. Switch to General image and reprocess if green parts of the subject disappear. For a clear green-screen photo, you can also try the Green screen setting.'] },
      { heading: 'The queue is full or the service is offline', paragraphs: ['The processing service has limited capacity. If the queue or rate limit is full, wait and retry. A connection error may mean that the backend is offline or unavailable.', 'If the image appears on a solid background after downloading, open the PNG in a transparency-aware editor and check its alpha channel. Some viewers show transparent areas as white.'] },
    ],
  },
];

export function GuidesPage() {
  return <main className="document guides-index"><a className="back-link" href="/"><ArrowLeft size={15}/> Back to the studio</a><h1>Make more<br/><em>with your images.</em></h1><p className="document-lead">Practical guides to clean cutouts, transparent images, and smoother workflows.</p><div className="doc-rule"/><div className="guide-list">{guides.map(guide => <article className="guide-list-item" key={guide.slug}><a href={`/guides/${guide.slug}`}><div><h2>{guide.title}</h2><p>{guide.description}</p></div><ArrowRight size={20} aria-hidden="true"/></a></article>)}</div></main>;
}

export function GuidePage({ guide }: { guide: Guide }) {
  return <main className="document guide-article"><a className="back-link" href="/guides"><ArrowLeft size={15}/> All guides</a><article><h1>{guide.title}</h1><p className="document-lead">{guide.intro}</p><div className="doc-rule"/>{guide.sections.map(section => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</section>)}</article><div className="guide-next"><h2>Ready to make a cutout?</h2><p>Upload a still image, or paste one from your clipboard.</p><a className="button primary" href="/">Open the studio <ArrowRight size={16}/></a></div><p><a className="back-link" href="/guides">Explore all guides <ArrowRight size={15}/></a></p></main>;
}
