import SignaturBridge from "./SignaturBridge";

export default function PatientAnamneseSignPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const rawUrl = typeof searchParams?.url === "string" ? searchParams.url : "";

  return <SignaturBridge signingUrl={rawUrl} />;
}
