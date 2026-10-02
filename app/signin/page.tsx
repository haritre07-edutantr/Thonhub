import SignInForm from '../sign-in-form';
import { safeReturnPath } from '../../lib/request-security';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const params = await searchParams;
  return <SignInForm returnTo={safeReturnPath(params.return_to)}/>;
}
