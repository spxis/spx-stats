import { Rich } from "./i18n/Rich";

/** Where address-plus, the library that formats every venue address on the site, is described. */
export const ADDRESS_PLUS_URL = "https://github.com/johnmorrisdotca/address-plus";

/** The credit for address-plus, shown wherever a formatted venue address is: `text` is the phrase "address.credit" in the reader's language. */
export function AddressCredit({ text }: { text: string }) {
  return <Rich text={text} parts={{ link: <a href={ADDRESS_PLUS_URL} target="_blank" rel="noopener noreferrer">address-plus</a> }} />;
}
