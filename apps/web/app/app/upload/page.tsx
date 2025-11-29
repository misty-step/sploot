import { redirect } from 'next/navigation';

export default function LegacyUploadPage() {
  redirect('/app?upload=1');
}
