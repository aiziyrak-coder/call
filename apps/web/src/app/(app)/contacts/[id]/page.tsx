import { redirect } from 'next/navigation';

export default async function ContactDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  redirect('/calls');
}
