import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";

const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      {/* pt-14 on mobile for the top bar, lg:pt-0 + lg:ml-64 for desktop sidebar */}
      <main className="pt-14 lg:pt-0 lg:ml-64 bg-background min-h-screen">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
