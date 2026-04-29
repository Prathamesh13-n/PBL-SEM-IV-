# SmartPark Pro – Intelligent Parking System

SmartPark Pro is a web-based intelligent parking management system designed to assist users in managing parking locations, tracking vehicles, monitoring parking duration, and handling overtime fines. The system includes an administrative control panel for overseeing parking activities, applying fines, and viewing real-time parking slot maps.

This project is implemented using HTML, CSS, and JavaScript with LocalStorage for data persistence, providing a lightweight frontend simulation of a comprehensive smart parking solution.

## Features

### User Features

- User registration and login
- Save parking locations with facility, area, and slot details
- Interactive parking slot map
- "Find My Car" navigation map
- View active parking sessions
- Parking history tracking
- Vehicle management (add/remove vehicles)
- Parking ticket with QR code generation
- Real-time timer for parking duration

### Premium & Family Plans

#### Free Plan
- 12 hours of free parking
- 1 vehicle allowed
- Warning notification at 10 hours
- ₹500 per hour overtime fine

#### Premium Plan
- ₹399 for 2 months
- 20 hours of free parking
- Up to 5 vehicles
- Warning notification at 18 hours
- ₹300 per hour overtime fine

#### Family Pack
- ₹999 for 2 months
- Unlimited parking hours
- 3 family members
- 5 vehicles per member
- Zero overtime fines

### Admin Features

The admin panel enables administrators to:
- View all parking sessions
- Monitor live parking slots
- Detect overtime parking
- Apply manual fines
- End parking sessions
- Export parking data (CSV)
- View fine collection logs

### Smart Parking Map

The system provides a visual parking grid with the following indicators:
- Green slots: Available
- Red slots: Occupied
- Blue slot: Selected

Administrators can also access:
- Live occupancy statistics
- Overtime vehicle alerts
- Slot-wise user details

### Fine & Payment System

The system automatically calculates overtime fines based on parking duration.

Supported payment options:
- UPI / QR code
- Credit/Debit card
- Net banking
- Cash payments

Administrators can manually apply fines for:
- Overtime parking
- Incorrect slot usage
- Blocking emergency lanes
- Unauthorized parking

### Dashboard Analytics

The user dashboard provides:
- Total parking sessions
- Active session count
- Registered vehicles
- Membership status
- Parking activity charts
- Facility usage charts

Charts are generated using Chart.js.

## Technologies Used

| Technology | Purpose |
|------------|---------|
| HTML5 | Page structure |
| CSS3 | Styling and user interface |
| JavaScript | Application logic |
| LocalStorage | Client-side data storage |
| Chart.js | Dashboard analytics and charts |
| QRCode.js | QR code generation for tickets |
