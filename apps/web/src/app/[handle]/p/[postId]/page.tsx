'use client';
import { useParams } from 'next/navigation';
import { ContentView } from '@/components/content-view';
export default function PostPage() {
  const { handle, postId } = useParams<{ handle: string; postId: string }>();
  return <ContentView key={`${handle}/${postId}`} handle={handle} id={postId} />;
}
