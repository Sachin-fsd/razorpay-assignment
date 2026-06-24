CREATE TABLE IF NOT EXISTS reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_id uuid REFERENCES users(id),
  title text,
  description text,
  amount numeric,
  rm_approved boolean DEFAULT false,
  ape_approved boolean DEFAULT false,
  status text DEFAULT 'PENDING',
  created_at timestamptz DEFAULT now()
);
