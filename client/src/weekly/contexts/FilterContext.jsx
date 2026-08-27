import { createContext, useContext, useState } from "react";
import dayjs from "dayjs";

function getDefaultFilters() {
  const now = dayjs();
  const refDate = now.subtract(7, "day");
  
  const dateFrom = refDate.startOf("month").format("YYYY-MM-DD");
  const dateTo =
    refDate.year() === now.year() && refDate.month() === now.month()
      ? now.format("YYYY-MM-DD")
      : refDate.endOf("month").format("YYYY-MM-DD");

  return {
    province: "ALL",
    office: "ALL",
    businessGroup: "ALL",
    dateFrom,
    dateTo,
  };
}

const defaultFilters = getDefaultFilters();

const FilterContext = createContext({
  filters: defaultFilters,
  setFilters: () => {},
  resetFilters: () => {},
});

export function FilterProvider({ children }) {
  const [filters, setFiltersState] = useState(defaultFilters);

  const setFilters = (partial) =>
    setFiltersState((prev) => ({ ...prev, ...partial }));

  const resetFilters = () => setFiltersState(getDefaultFilters());

  return (
    <FilterContext.Provider value={{ filters, setFilters, resetFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export const useFilters = () => useContext(FilterContext);
