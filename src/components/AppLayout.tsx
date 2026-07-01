import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { AppDataProvider } from "@/contexts/AppDataContext";

const AppLayout = () => {
  return (
    <AppDataProvider>
      <div className="min-h-screen bg-background overflow-x-hidden">
        <AppSidebar />
        {/* pt-14 on mobile for the top bar, lg:pt-0 + lg:ml-64 for desktop sidebar */}
        <main className="pt-14 lg:pt-0 lg:ml-64 bg-background min-h-screen px-3 py-3 sm:px-6 sm:py-6 lg:px-8 lg:py-7 max-w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </AppDataProvider>
  );
};

export default AppLayout;
