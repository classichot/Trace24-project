import { Trace24Provider } from '@/context/trace24-context';
import { Trace24App } from '@/components/trace24/trace24-app';

export default function Home() {
  return (
    <Trace24Provider>
      <Trace24App />
    </Trace24Provider>
  );
}
