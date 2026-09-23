import { redirect } from 'next/navigation';

/** Keep existing order-list links valid; P11 now lives in the stable Meu shell. */
export default function DealsPage() { redirect('/meu?tab=pedidos'); }
