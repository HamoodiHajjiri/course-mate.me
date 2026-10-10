'use client';

import { useEffect, useState } from 'react';

/** The label for the command key on this device: ⌘ on Apple, Ctrl elsewhere. */
export default function useModKey() {
    const [key, setKey] = useState('Ctrl');
    useEffect(() => {
        if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setKey('⌘');
    }, []);
    return key;
}
