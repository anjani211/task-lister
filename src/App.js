import Header from "./Components/Header";
import Tasks from "./Components/Tasks";
import { useState } from "react";
import AddTask from "./Components/AddTask";

// import "./index.css";

function App() {
  const [showAddTask, setShowAddTask] = useState(false);
  const [tasks, setTasks] = useState([
    {
      id: 1,
      text: "Doctor",
      day: "Feb 5",
      reminder: true,
    },
    {
      id: 2,
      text: "engineer",
      day: "Feb 4",
      reminder: true,
    },
    {
      id: 3,
      text: "sweeper",
      day: "Feb 6",
      reminder: false,
    },
    {
      id: 4,
      text: "hero",
      day: "Feb 5",
      reminder: true,
    },
  ]);
  // Toggle reminder

  const onToggle = (id) => {
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, reminder: !task.reminder } : task
      )
    );
  };

  //Add Task
  const addTask = (task) => {
    const id = Math.floor(Math.random() * 10000) + 1;
    const newTask = { id, ...task };
    setTasks([...tasks, newTask]);
  };

  //Delete Task

  const deleteTask = (id) => {
    setTasks(tasks.filter((task) => task.id !== id));
  };
  return (
    <div className="container">
      <Header
        title="Task Tracker"
        onAdd={() => setShowAddTask(!showAddTask)}
        showAdd={showAddTask}
      />
      {showAddTask && <AddTask onAdd={addTask} />}
      {/* <AddTask onAdd={addTask} /> */}
      {tasks.length > 0 ? (
        <Tasks tasks={tasks} onDelete={deleteTask} onToggle={onToggle} />
      ) : (
        "No tasks present"
      )}
    </div>
  );
}

export default App;
