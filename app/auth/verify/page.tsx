import VerifyForm from '../../verify-form';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <VerifyForm token={typeof params.token === 'string' && /^[a-f0-9]{64}$/.test(params.token) ? params.token : ''}/>;
}
