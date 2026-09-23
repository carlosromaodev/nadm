'use client';
import { useParams } from 'next/navigation';
import { ContentView } from '@/components/content-view';
export default function PlaylistPage() {
  const { handle, playlistId } = useParams<{ handle: string; playlistId: string }>();
  return <ContentView key={`${handle}/${playlistId}`} handle={handle} id={playlistId} playlist />;
}
