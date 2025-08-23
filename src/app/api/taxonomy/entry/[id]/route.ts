"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function TaxonomyPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rightOpen, setRightOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const openClone = () => setCloneOpen(true);
  const closeClone = () => setCloneOpen(false);

  const router = useRouter();

  // ... other code ...

  return (
    <div>
      <header>
        {/* Other header content */}
        <button onClick={openClone}>ทำสำเนา</button>
      </header>
      {/* Other content */}
    </div>
  );
}