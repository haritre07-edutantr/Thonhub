import Hub from '../hub';
import { redirect } from 'next/navigation';
import { identity } from '../../lib/hub';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { admin } = await identity();
  if (!admin) redirect('/');
  return <Hub view="admin" />;
}
