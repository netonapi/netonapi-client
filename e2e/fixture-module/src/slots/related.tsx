import type { ServerSlotProps } from "@neton/application-client-runtime/public";
import { Star } from "../client/star";

/** `public.object.after`：服务端出一串相关条目，每条带一个访问者状态岛（批量取，§9.4）。 */
export default function Related({ objectRef }: ServerSlotProps) {
  const ids = ["1", "2", "3", "4", "5"].filter((id) => id !== objectRef.id);
  return (
    <ul data-testid="related">
      {ids.map((id) => <li key={id}>Related {id} <Star id={id} /></li>)}
    </ul>
  );
}
