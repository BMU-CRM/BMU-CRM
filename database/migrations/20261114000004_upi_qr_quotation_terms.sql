-- The UPI QR code the owner gave, printed beside the payment details on quotations and
-- invoices, and the default terms for new quotations. Both stay editable in Settings,
-- Finance settings; the terms can also be changed on each quotation.
--
-- The QR is rebuilt module for module from the owner's image (37 by 37, error
-- correction M) at print quality. It is only filled in where none was uploaded.
-- The date in the first term is replaced with each quotation's "Valid until" date.

update public.finance_settings
set upi_qr_image = 'data:image/webp;base64,UklGRhYCAABXRUJQVlA4TAkCAAAvG8KGAA8w//M///MfeJDcRpIkSaFB6q9lalCXuUXN8YqZ2Y3oPxzGbSRJ6qgbMFAOPD17b358h7X+B5KStY/aFBUBj6SKdWA4cuwTXqHdJ3kQddlWg5z8qM7IlPr0wybIH4MkKod+NVficfwA5AXnxT25fMR/DCKAkFaRxnEHr30fHfZ85GsVH9w1X+8Y+vQrdGzomfvirFt0zX1qu7SZeDC8OWLIG/s8hLSwifb2q4Q9Kis9Zj7hlQNOvJAd0JXOfvbBWhqoQxJTbIgePgZGP7AQGF6SyWjJ+lWNsY8oeOJ9NA8Ay2ZbM5+oFTJCMkuZZkfb5AfMGHRefe1wa608ACY/NuKyk3fGN98vkhZHPzs4gspWApASaZRtTX5Y54A8qEpb1NIz+5FBf3YiMc/BUrsz82TuI6U+6zbQqx33wMx8FKXDHevNQYS82kOfXlrhItlvTrbInmY/hEhps0OtdnOwIRrmPpjjaIK62B3t9IcwW5n52IhLbUq4E1K0xZPBj5FltRImDSSRN/eBKFxkhHcHKRkNcuwTBxWT7UAkSPI8UOHop3upDHKO/ovO6vEMfozm5GMZINvy3eQnFYeIojQMO5qDyp2jH6e9vQZXOQmd/Qgkmaty3MNLLD056z8GAcb6EIyEzuGPAGSmeWAnscwz7fnQ1yoSYzekD71iZj3f43/3/gckCwA='
where upi_qr_image is null;

update public.finance_settings
set quotation_terms = '1. This quotation is valid until 10 November 2026.
2. Influencer fees are quoted as a range; the final amount depends on the profiles the client approves.
3. BMU Marketing outsourcing charges of ₹25,000 are fixed and apply to the full campaign.
4. 50% advance to begin the campaign; balance on delivery of content.
5. Taxes extra as applicable.';
