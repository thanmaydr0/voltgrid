import { HouseRegistrationWizard } from "@/components/house/HouseRegistrationWizard";

export const metadata = {
  title: "Register House | VoltGrid",
  description: "Declare and verify a VoltGrid house configuration on-chain.",
};

export default function HouseRegisterPage() {
  return <HouseRegistrationWizard />;
}
