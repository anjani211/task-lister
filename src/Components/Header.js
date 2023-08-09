import React from "react";
import Button from "./Button";

function Header({ title }) {
  const onClick = () => {
    console.log("add");
  };
  return (
    <div>
      <header className="header">
        <h1>{title}</h1>
        <Button color="green" text="Add" onClick={onClick} />
      </header>
    </div>
  );
}

export default Header;
