import { NotebookEditor } from "@/components/editor/notebook-editor";
import { ServiceStatus } from "@/components/service-status";

export default function Home() {
  return <NotebookEditor connection={<ServiceStatus/>}/>;
}
