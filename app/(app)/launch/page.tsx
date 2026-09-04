import type { Metadata } from "next";

import { Card, PageHeader } from "@/components";

export const metadata: Metadata = {
  title: "New product launch",
};

export default function LaunchPage() {
  return (
    <>
      <PageHeader eyebrow="No sales history" title="New product launch" />
      <Card>
        <p className="text-[11.5px] leading-[1.6] text-[#8D857D]">
          The new product launch screen is not built yet; phase 5 builds this screen.
        </p>
      </Card>
    </>
  );
}
