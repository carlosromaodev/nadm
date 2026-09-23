import { redirect } from 'next/navigation';

/** A decisão vive no Deal real, sem outro pedido de marca simulado. */
export default async function CreatorDealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/deals/${encodeURIComponent(id)}`);
}
