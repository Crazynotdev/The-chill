import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard'); // le middleware renvoie vers /login si non authentifié
}
