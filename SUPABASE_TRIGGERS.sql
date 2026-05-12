-- ============================================
-- Database Triggers
-- สำหรับอัปเดตข้อมูลอัตโนมัติ
-- ============================================

-- ============================================
-- 1. TRIGGER: Update user_credits when credit_transaction is approved
-- ============================================

-- Function to update user credit balance
CREATE OR REPLACE FUNCTION update_user_credit_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update when status changes to 'approved'
    IF NEW."Status" = 'approved' AND (OLD."Status" IS NULL OR OLD."Status" != 'approved') THEN
        -- Insert or update user_credits
        INSERT INTO user_credits ("UserEmail", "Balance", "TotalAdded", "UpdatedAt")
        VALUES (NEW."UserEmail", NEW."Amount", NEW."Amount", NOW())
        ON CONFLICT ("UserEmail") 
        DO UPDATE SET
            "Balance" = user_credits."Balance" + NEW."Amount",
            "TotalAdded" = user_credits."TotalAdded" + NEW."Amount",
            "UpdatedAt" = NOW();
    END IF;
    
    -- If status changes from 'approved' to something else, reverse the credit
    IF OLD."Status" = 'approved' AND NEW."Status" != 'approved' THEN
        UPDATE user_credits
        SET
            "Balance" = user_credits."Balance" - OLD."Amount",
            "TotalAdded" = user_credits."TotalAdded" - OLD."Amount",
            "UpdatedAt" = NOW()
        WHERE "UserEmail" = OLD."UserEmail";
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_user_credit_balance ON credit_transactions;
CREATE TRIGGER trigger_update_user_credit_balance
    AFTER INSERT OR UPDATE OF "Status" ON credit_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_user_credit_balance();

-- ============================================
-- 2. TRIGGER: Update user_credits when credit is used in order
-- ============================================

-- Function to deduct credit when order is placed with credit payment
CREATE OR REPLACE FUNCTION deduct_credit_on_order()
RETURNS TRIGGER AS $$
DECLARE
    credit_used DECIMAL(10, 2);
BEGIN
    -- Check if payment method is credit
    IF NEW."PaymentMethod" = 'credit' THEN
        -- Get order total (from first row of order)
        SELECT "Total" INTO credit_used
        FROM "order"
        WHERE "OrderID" = NEW."OrderID"
        LIMIT 1;
        
        -- Deduct from user_credits
        UPDATE user_credits
        SET
            "Balance" = GREATEST(0, "Balance" - credit_used),
            "TotalUsed" = "TotalUsed" + credit_used,
            "UpdatedAt" = NOW()
        WHERE "UserEmail" = NEW."UserEmail";
        
        -- Log credit usage
        INSERT INTO credit_usage_log ("UserEmail", "OrderID", "Amount")
        VALUES (NEW."UserEmail", NEW."OrderID", credit_used);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_deduct_credit_on_order ON "order";
CREATE TRIGGER trigger_deduct_credit_on_order
    AFTER INSERT ON "order"
    FOR EACH ROW
    WHEN (NEW."PaymentMethod" = 'credit')
    EXECUTE FUNCTION deduct_credit_on_order();

-- ============================================
-- 3. TRIGGER: Create notification when order status changes
-- ============================================
-- Note: This can also be handled in application code

-- Function to create notification on order status change
CREATE OR REPLACE FUNCTION notify_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify if status actually changed
    IF OLD."Status" IS DISTINCT FROM NEW."Status" AND NEW."Status" != 'รอตรวจสอบ' THEN
        INSERT INTO notifications ("UserEmail", "Type", "Title", "Message", "OrderID", "Metadata")
        VALUES (
            NEW."UserEmail",
            'order_status_changed',
            'สถานะออเดอร์เปลี่ยนแปลง',
            'ออเดอร์ ' || NEW."OrderID" || ' สถานะเปลี่ยนเป็น: ' || NEW."Status",
            NEW."OrderID",
            jsonb_build_object(
                'status', NEW."Status",
                'oldStatus', OLD."Status",
                'trackingNo', NEW."TrackingNo"
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_order_status_change ON "order";
CREATE TRIGGER trigger_notify_order_status_change
    AFTER UPDATE OF "Status" ON "order"
    FOR EACH ROW
    EXECUTE FUNCTION notify_order_status_change();

-- ============================================
-- NOTES:
-- ============================================
-- 1. Triggers จะทำงานอัตโนมัติเมื่อมีการ INSERT/UPDATE
-- 2. ควรทดสอบ triggers หลังจากสร้าง
-- 3. ถ้าไม่ต้องการใช้ triggers สามารถลบได้ด้วย: DROP TRIGGER trigger_name ON table_name;
-- 4. สำหรับการแจ้งเตือน อาจจะดีกว่าถ้าทำใน application code เพื่อให้ควบคุมได้ง่ายกว่า
