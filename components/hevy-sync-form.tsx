'use client';

import { useFormStatus } from 'react-dom';
import { sync } from '../app/actions';

function SyncControls() {
  const { pending, data } = useFormStatus();
  return <>
    <button className="button" name="mode" value="sync" disabled={pending}>Sync workouts</button>
    <button className="button secondary" name="mode" value="test" disabled={pending}>Test connection</button>
    <span role="status">{pending && (data?.get('mode') === 'test'
      ? 'Checking the Hevy connection…'
      : 'Synchronizing workout history and exercise templates…')}</span>
  </>;
}

export function HevySyncForm() {
  return <form action={sync} className="inline"><SyncControls/></form>;
}
