/**
 * Delivery System Setup Script
 * Instructions for setting up the delivery system in PocketBase
 */

/*
1. UPDATE EXISTING COLLECTIONS:

A. Update 'profiles' collection (for merchants):
   - Add field: delivery_method (type: select, options: bobo_managed, merchant_self, third_party, customer_pickup)
   - Add field: preferred_carriers (type: json)
   - Add field: delivery_zones (type: json)
   - Add field: pickup_available (type: bool, default: false)
   - Add field: delivery_cost_markup (type: number, default: 0)
   - Add field: allow_customer_pickup (type: bool, default: false)
   - Add field: allow_self_delivery (type: bool, default: false)
   - Add field: allow_third_party (type: bool, default: false)
   - Add field: pickup_location (type: text)
   - Add field: pickup_instructions (type: text)

B. Update 'orders' collection:
   - Add field: delivery_method (type: select, options: bobo_managed, merchant_self, third_party, customer_pickup)
   - Add field: delivery_status (type: select, options: pending_dispatch, assigned, picked_up, in_transit, delivered, failed, customer_pickup_scheduled, customer_pickup_completed)
   - Add field: delivery_person_id (type: text)
   - Add field: delivery_person_name (type: text)
   - Add field: delivery_person_phone (type: text)
   - Add field: delivery_cost (type: number)
   - Add field: delivery_completed_at (type: text)
   - Add field: delivery_tracking_url (type: text)
   - Add field: delivery_notes (type: text)

2. CREATE NEW COLLECTIONS:

A. Create 'delivery_requests' collection:
   - order_id (type: text, required)
   - merchant_id (type: text, required)
   - delivery_method (type: select, options: bobo_managed, merchant_self, third_party, customer_pickup)
   - delivery_status (type: select, options: pending_dispatch, assigned, picked_up, in_transit, delivered, failed, customer_pickup_scheduled, customer_pickup_completed)
   - delivery_person_id (type: text)
   - delivery_person_name (type: text)
   - delivery_person_phone (type: text)
   - pickup_address (type: text, required)
   - dropoff_address (type: text, required)
   - pickup_coordinates (type: json)
   - dropoff_coordinates (type: json)
   - delivery_cost (type: number)
   - delivery_notes (type: text)
   - assigned_at (type: text)
   - picked_up_at (type: text)
   - delivered_at (type: text)
   - delivery_tracking_url (type: text)
   - created_at (type: text)
   - updated_at (type: text)

B. Create 'delivery_persons' collection:
   - name (type: text, required)
   - phone (type: text, required)
   - zone (type: text, required)
   - rating (type: number, default: 0)
   - active (type: bool, default: true)
   - vehicle_type (type: select, options: moto, car, truck, bicycle, default: moto)
   - created_at (type: text)
   - updated_at (type: text)

C. Create 'delivery_zones' collection:
   - name (type: text, required)
   - coordinates (type: json)
   - active (type: bool, default: true)

3. SET UP API RULES:

A. For 'delivery_requests' collection:
   - List rule: owner = @request.auth.id || @request.auth.role = 'admin'
   - View rule: owner = @request.auth.id || @request.auth.role = 'admin' || delivery_person_id = @request.auth.id
   - Create rule: @request.auth.id != ''
   - Update rule: owner = @request.auth.id || @request.auth.role = 'admin'
   - Delete rule: @request.auth.role = 'admin'

B. For 'delivery_persons' collection:
   - List rule: @request.auth.role = 'admin'
   - View rule: @request.auth.id != ''
   - Create rule: @request.auth.role = 'admin'
   - Update rule: @request.auth.role = 'admin'
   - Delete rule: @request.auth.role = 'admin'

4. TEST THE SETUP:

A. Register a delivery person using the DeliveryPersonRegistration screen
B. Create an order and verify delivery request is created
C. Assign a delivery to a delivery person
D. Update delivery status and verify order status updates
E. Check that customers can track their deliveries
F. Verify merchants can set delivery preferences
*/

console.log("Delivery System Setup Instructions:");
console.log("1. Update PocketBase collections using the Admin UI");
console.log("2. Add the fields as specified in the comments above");
console.log("3. Set up the API rules for proper access control");
console.log("4. Test the system with the provided screens");