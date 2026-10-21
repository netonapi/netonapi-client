import type { ServerSlotProps } from "@neton/application-client-runtime/public";

/** `public.object.bar`：对象详情页的手机吸底条（§10.2）。夹具只输出一个可断言的按钮。 */
export default function Bar({ objectRef }: ServerSlotProps) {
  return <button type="button" data-testid="bar-action" data-id={objectRef.id}>Bar</button>;
}
